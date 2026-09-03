import api from './api';

async function getCasePrecedents(caseId) {
  const { data } = await api.get(`/cases/${caseId}/precedents`);
  return data.data;
}

async function searchJudgments(payload) {
  const { data } = await api.post('/research/judgments/search', payload);
  return data.data;
}

export default {
  getCasePrecedents,
  searchJudgments,
};