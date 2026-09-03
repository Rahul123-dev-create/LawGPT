import api from './api';

async function createCase(payload) {
  const { data } = await api.post('/cases', payload);
  return data.data.case;
}

async function listCases(params = {}) {
  const { data } = await api.get('/cases', { params });
  return data.data; // { cases, pagination }
}

async function getCase(id) {
  const { data } = await api.get(`/cases/${id}`);
  return data.data; // { case, stats }
}

async function updateCase(id, payload) {
  const { data } = await api.put(`/cases/${id}`, payload);
  return data.data.case;
}

async function deleteCase(id) {
  await api.delete(`/cases/${id}`);
}

async function undeleteCase(id) {
  const { data } = await api.patch(`/cases/${id}/undelete`);
  return data.data.case;
}

async function changeStatus(id, status) {
  const { data } = await api.patch(`/cases/${id}/status`, { status });
  return data.data.case;
}

async function archiveCase(id) {
  const { data } = await api.patch(`/cases/${id}/archive`);
  return data.data.case;
}

async function restoreCase(id) {
  const { data } = await api.patch(`/cases/${id}/restore`);
  return data.data.case;
}

async function togglePin(id, isPinned) {
  const { data } = await api.patch(`/cases/${id}/pin`, { isPinned });
  return data.data.case;
}

async function addParty(id, payload) {
  const { data } = await api.post(`/cases/${id}/parties`, payload);
  return data.data.case;
}

async function updateParty(id, partyId, payload) {
  const { data } = await api.put(`/cases/${id}/parties/${partyId}`, payload);
  return data.data.case;
}

async function deleteParty(id, partyId) {
  const { data } = await api.delete(`/cases/${id}/parties/${partyId}`);
  return data.data.case;
}

async function addNote(id, content) {
  const { data } = await api.post(`/cases/${id}/notes`, { content });
  return data.data.case;
}

async function updateNote(id, noteId, content) {
  const { data } = await api.put(`/cases/${id}/notes/${noteId}`, { content });
  return data.data.case;
}

async function deleteNote(id, noteId) {
  const { data } = await api.delete(`/cases/${id}/notes/${noteId}`);
  return data.data.case;
}

async function getTimeline(id) {
  const { data } = await api.get(`/cases/${id}/timeline`);
  return data.data.events;
}

async function generateCaseArguments(id) {
  const { data } = await api.post(`/cases/${id}/arguments/generate`);
  return data.data.arguments;
}

async function getCaseArguments(id) {
  const { data } = await api.get(`/cases/${id}/arguments`);
  return data.data.arguments;
}

export default {
  createCase,
  listCases,
  getCase,
  updateCase,
  deleteCase,
  undeleteCase,
  changeStatus,
  archiveCase,
  restoreCase,
  togglePin,
  addParty,
  updateParty,
  deleteParty,
  addNote,
  updateNote,
  deleteNote,
  getTimeline,
  generateCaseArguments,
  getCaseArguments,
};
