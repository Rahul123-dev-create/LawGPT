import api from './api';

async function getCaseChat(caseId) {
  const { data } = await api.get(`/cases/${caseId}/chat`);
  return data.data.messages;
}

async function sendMessageToCase(caseId, content) {
  const { data } = await api.post(`/cases/${caseId}/chat`, { content });
  return data.data;
}

async function clearCaseChat(caseId) {
  await api.delete(`/cases/${caseId}/chat`);
}

export default { getCaseChat, sendMessageToCase, clearCaseChat };
