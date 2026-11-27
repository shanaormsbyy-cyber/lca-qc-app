import api, { errMsg } from '../api';

// Permanently delete a team member everywhere (same as deleting from the Staff page).
// Returns true if deleted.
export default async function deleteTeamMember(id, name) {
  const ok = window.confirm(
    `Delete ${name} permanently?\n\n` +
    'This removes them from the whole app — their training records, QC checks, complaints and staff login. ' +
    'Shared QC checks stay for the other team members. This cannot be undone.'
  );
  if (!ok) return false;
  try {
    await api.delete(`/staff/${id}`, { baseURL: '/api' });
    return true;
  } catch (e) {
    window.alert(`Couldn't delete ${name}: ${errMsg(e)}`);
    return false;
  }
}
