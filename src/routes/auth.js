import express from 'express';
import {
  register,
  login,
  getProfile,
  updateProfile,
  getUsers,
} from '../controllers/auth.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.route('/profile')
  .get(protect, getProfile)
  .put(protect, updateProfile);
router.get('/users', protect, getUsers);

export default router;
