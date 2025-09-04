import { Router, Request, Response } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { AuthService } from '../services/authService.js';
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const router = Router();

// Защищенный роут для всех авторизованных пользователей
router.get('/data', authenticateToken, (req: Request, res: Response) => {
  res.json({
    message: 'This is protected data',
    user: req.user,
    timestamp: new Date().toISOString()
  });
});

// Защищенный роут только для админов
router.get('/admin', authenticateToken, requireRole(['admin']), (req: Request, res: Response) => {
  res.json({
    message: 'Admin only data',
    user: req.user,
    timestamp: new Date().toISOString()
  });
});

router.get("/me", authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const user = await AuthService.getUserById(userId);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.json({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    roleName: user.roleName,
  });
});

router.get("/users", authenticateToken, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany();

    if (!users || users.length === 0) {
      return res.status(404).json({ message: "Users not found" });
    }

    res.json({ users });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;