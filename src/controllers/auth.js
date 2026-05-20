import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'supersecretworknoonjwtkey123!', {
    expiresIn: '30d',
  });
};

const allowedRoles = ['admin', 'agent', 'customer', 'designer', 'merchant'];

export const register = async (req, res) => {
  try {
    const { username, email, password, avatar } = req.body;

    const userExists = await User.findOne({ $or: [{ email }, { username }] });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists with this email or username' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      role: 'customer',
      avatar: avatar || '',
      isOnline: false,
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const wordpressSync = async (req, res) => {
  try {
    const expectedSecret = process.env.WORDPRESS_SYNC_SECRET || 'worknoon-wordpress-dev-secret';
    const providedSecret = req.headers['x-worknoon-wp-secret'];

    if (providedSecret !== expectedSecret) {
      return res.status(401).json({ message: 'Invalid WordPress sync secret' });
    }

    const { username, email, role, avatar, wordpressUserId } = req.body;
    const normalizedRole = allowedRoles.includes(role) ? role : 'customer';

    if (!username || !email) {
      return res.status(400).json({ message: 'Username and email are required' });
    }

    let user = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { username },
        ...(wordpressUserId ? [{ wordpressUserId: wordpressUserId.toString() }] : []),
      ],
    });

    if (user) {
      user.email = email.toLowerCase();
      user.role = normalizedRole;
      user.avatar = avatar || user.avatar || '';
      user.wordpressUserId = wordpressUserId ? wordpressUserId.toString() : user.wordpressUserId;
      await user.save();
    } else {
      const salt = await bcrypt.genSalt(10);
      const randomPassword = `${Date.now()}-${Math.random()}-${email}`;
      const hashedPassword = await bcrypt.hash(randomPassword, salt);

      user = await User.create({
        username,
        email,
        password: hashedPassword,
        role: normalizedRole,
        avatar: avatar || '',
        wordpressUserId: wordpressUserId ? wordpressUserId.toString() : '',
        isOnline: false,
      });
    }

    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      token: generateToken(user._id),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A user already exists with this username or email' });
    }
    res.status(500).json({ message: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;

    const user = await User.findOne({
      $or: [{ email: emailOrUsername }, { username: emailOrUsername }],
    });

    if (user && (await bcrypt.compare(password, user.password))) {
      res.json({
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'Invalid email/username or password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      user.username = req.body.username || user.username;
      user.email = req.body.email || user.email;
      user.avatar = req.body.avatar || user.avatar;

      if (req.body.password) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(req.body.password, salt);
      }

      const updatedUser = await user.save();

      res.json({
        _id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role,
        avatar: updatedUser.avatar,
        token: generateToken(updatedUser._id),
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getUsers = async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id } }).select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role || !allowedRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role value' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.role = role;
    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      username: updatedUser.username,
      email: updatedUser.email,
      role: updatedUser.role,
      avatar: updatedUser.avatar,
      isOnline: updatedUser.isOnline,
      lastActive: updatedUser.lastActive,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
