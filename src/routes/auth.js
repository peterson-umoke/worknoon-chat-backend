import express from 'express';
import {
  register,
  wordpressSync,
  login,
  getProfile,
  updateProfile,
  getUsers,
  updateUserRole,
} from '../controllers/auth.js';
import { protect, roleCheck } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', register);
router.post('/wordpress-sync', wordpressSync);
router.post('/login', login);
router.route('/profile')
  .get(protect, getProfile)
  .put(protect, updateProfile);
router.get('/users', protect, roleCheck(['admin']), getUsers);
router.patch('/users/:id/role', protect, roleCheck(['admin']), updateUserRole);

export default router;
