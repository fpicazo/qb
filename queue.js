const queue = [];

function addJob(job) { // {type: 'CustomerAdd'|'InvoiceQuery', payload:{}}
  queue.push({ id: Date.now().toString(), status: 'pending', ...job });
}

function getNextPending() {
  const job = queue.find(j => j.status === 'pending');
  if (job) job.status = 'processing';
  return job || null;
}

function markDone(id, extra={}) {
  const j = queue.find(x => x.id === id);
  if (j) { j.status = 'done'; j.result = extra; }
}

function markError(id, err) {
  const j = queue.find(x => x.id === id);
  if (j) { j.status = 'error'; j.error = String(err); }
}

module.exports = { addJob, getNextPending, markDone, markError, _queue: queue };
