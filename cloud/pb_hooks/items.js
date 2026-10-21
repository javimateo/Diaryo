/**
 * The checks on every item that is saved (see main.pb.js): the most recent change wins,
 * no change is stamped in the future, the server computes its size, and the user's total
 * stays within their quota.
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

    // Growing beyond the quota is refused; shrinking or deleting always goes through.
    const growing = !original || (!deleted && size > original.getInt('size'));
    if (!growing) return;
    const userId = record.getString('user');
    const user = e.app.findRecordById('users', userId);
    const used = new DynamicModel({ total: 0 });
    e.app
      .db()
      .newQuery(
        'SELECT COALESCE(SUM(size), 0) AS total FROM items WHERE user = {:user} AND id != {:id}',
      )
      .bind({ user: userId, id: record.id })
      .one(used);
    if (used.total + size > user.getInt('quotaBytes')) {
      throw new ApiError(403, 'quota_exceeded');
    }
  },
};
