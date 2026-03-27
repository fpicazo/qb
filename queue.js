// queue.js - Job queue management

const queue = [];

function addJob(job) {
  // job: { type: 'CustomerQuery', payload: {...} }
  const { requestId: _ignoredRequestId, ...jobWithoutRequestId } = job || {};
  const jobWithId = {
    id: Date.now().toString(),
    status: 'pending',
    ...jobWithoutRequestId
  };
  queue.push(jobWithId);
  console.log(`✅ Job queued: ${jobWithId.id} (${job.type})`);
  return jobWithId;
}

function getNextPending() {
  const job = queue.find(j => j.status === 'pending');
  if (job) {
    job.status = 'processing';
    console.log(`🔄 Job now processing: ${job.id}`);
  }
  return job || null;
}

function markDone(id, extra = {}) {
  const job = queue.find(x => x.id === id);
  if (job) {
    job.status = 'done';
    job.result = extra;
    job.completedAt = new Date().toISOString();
    console.log(`✅ Job completed: ${id}`);
  }
}

function markError(id, err) {
  const job = queue.find(x => x.id === id);
  if (job) {
    job.status = 'error';
    job.error = String(err);
    job.errorAt = new Date().toISOString();
    console.log(`❌ Job error: ${id} - ${err}`);
  }
}

module.exports = {
  addJob,
  getNextPending,
  markDone,
  markError,
  _queue: queue
};
