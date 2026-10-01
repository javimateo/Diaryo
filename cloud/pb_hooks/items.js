/**
 * The checks on every item that is saved (see main.pb.js): the most recent change wins,
 * the server computes its size, and the user's total stays within their quota.
 */

/** What each item costs besides its content (key, dates, flags…), in bytes. */
const OVERHEAD = 200;

module.exports = {
  /**
   * @param {core.RecordRequestEvent} e The create or update request.
   * @param {core.Record | null} original The item as it was (null when creating).
   */
  checkItem(e, original) {
    const record = e.record;
    // An older change than the stored one: that device must pull first.
    if (original && record.getInt('modified') < original.getInt('modified')) {
      throw new ApiError(409, 'stale');
    }
    // A tombstone keeps no content.
    if (record.getBool('deleted')) record.set('data', '');
    const size = record.getString('data').length + OVERHEAD;
    record.set('size', size);

    // Growing beyond the quota is refused; shrinking or deleting always goes through.
    const growing = !original || size > original.getInt('size');
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
