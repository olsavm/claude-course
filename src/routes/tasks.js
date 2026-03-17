const { Router } = require('express');
const {
  createTask,
  listTasks,
  searchTasks,
  getTask,
  updateTask,
  deleteTask,
  transitionStatus,
} = require('../controllers/tasks');

const router = Router();

// /search must be registered before /:id to avoid Express treating "search" as an id
router.get('/search', searchTasks);

router.get('/',     listTasks);
router.post('/',    createTask);
router.get('/:id',         getTask);
router.put('/:id',         updateTask);
router.delete('/:id',      deleteTask);
router.patch('/:id/status', transitionStatus);

module.exports = router;
