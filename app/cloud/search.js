export function validateSearch(count, times = []) {
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error('Choose between 1 and 20 matches.');
  if (times.length > 3 || new Set(times).size !== times.length || times.some(t => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t) || t === '09:00')) throw new Error('Choose up to three different extra times. The 9 am search is already included.');
  return {count, times: [...times].sort()};
}
export async function searchControl(client, action = 'get', {count = 5, times = [], revision = 0, requestId = null} = {}) {
  if (action !== 'get') validateSearch(count, times);
  const {data, error} = await client.rpc('jobpilot_search_control', {p_action: action, p_count: count, p_times: times, p_revision: revision, p_request_id: requestId}).abortSignal(AbortSignal.timeout(20000));
  if (error) throw new Error(error.message || 'Search service unavailable. Please try again.');
  if (!data?.preferences || !Array.isArray(data.requests)) throw new Error('Invalid search service response.');
  return data;
}
