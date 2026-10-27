/**
 * The checks on every item that is saved (see main.pb.js): the most recent change wins,
 * no change is stamped in the future, the server computes its size, and the user's total
 * stays within their quota. The total is kept on the user (`usedBytes`), changed with
 * each write in its transaction: adding up every item on each write made the writes of a
 * big account slow, and everyone's behind them.
 */

/** What each item costs besides its content (key, dates, flags…), in bytes. */
const OVERHEAD = 200;
/** How far ahead of the server's clock a change may be stamped (the devices follow it). */
const AHEAD = 60 * 1000;
/** A tombstone only carries its sealed path and time (see src/cloud/sync.ts). */
const TOMBSTONE_MAX = 1000;

module.exports = {
  /**
   * @param {core.RecordRequestEvent} e The create or update request.
   * @param {core.Record | null} original The item as stored now (null when creating).
   * @returns {number} How much the user's total changes once it is saved.
   */
  checkItem(e, original) {
    const record = e.record;
    // A time in the future would win every conflict and leave the item impossible to
    // change: it becomes now. One already stored that way (from before this check) can be
    // replaced.
    const now = Date.now();
    if (record.getInt('modified') > now + AHEAD) record.set('modified', now);
    const frozen = original && original.getInt('modified') > now + AHEAD;
    // An older change than the stored one: that device must pull first.
    if (original && !frozen && record.getInt('modified') < original.getInt('modified')) {
      throw new ApiError(409, 'stale');
    }
    const deleted = record.getBool('deleted');
    if (deleted && record.getString('data').length > TOMBSTONE_MAX) {
      throw new ApiError(400, 'tombstone_too_big');
    }
    const size = record.getString('data').length + OVERHEAD;
    record.set('size', size);
    const before = original ? original.getInt('size') : 0;

    // Growing beyond the quota is refused; shrinking or deleting always goes through.
    const growing = !original || (!deleted && size > before);
    if (growing) {
      const user = e.app.findRecordById('users', record.getString('user'));
      if (user.getInt('usedBytes') - before + size > user.getInt('quotaBytes')) {
        throw new ApiError(403, 'quota_exceeded');
      }
    }
    return size - before;
  },

  /** Changes a user's total (in the same transaction as the write that changed it). */
  addUsed(app, userId, change) {
    if (change === 0) return;
    app
      .db()
      .newQuery('UPDATE users SET usedBytes = usedBytes + {:change} WHERE id = {:user}')
      .bind({ change, user: userId })
      .execute();
  },
};
