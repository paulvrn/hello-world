const express = require('express');
const { all } = require('../db');
const { requireRole } = require('../auth');

const router = express.Router();
router.use(requireRole('client'));

router.get('/', (req, res) => {
  const projects = all('SELECT * FROM projects WHERE client_user_id = ? ORDER BY id DESC', req.user.id);
  res.render('client-home', { projects });
});

module.exports = router;
