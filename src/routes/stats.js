const { Router } = require('express');
const { getStats } = require('../controllers/stats');

const router = Router();

router.get('/', getStats);

module.exports = router;
