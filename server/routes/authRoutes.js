import { Router } from 'express';
import {
  getCurrentUser,
  loginUser,
  registerUser,
} from '../controllers/authController.js';
import { authenticate } from '../middleware/authenticate.js';

export const authRoutes = Router();

authRoutes.post('/register', registerUser);
authRoutes.post('/login', loginUser);
authRoutes.get('/me', authenticate, getCurrentUser);
