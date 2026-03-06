// Demo users storage (for development without database)
// In production, use the actual database

const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(process.cwd(), 'data', 'demo-users.json');

// Default admin user
const DEFAULT_ADMIN = {
  id: 1,
  email: 'admin@hotel.com',
  password: 'admin123', // Plain text for demo (in production, use hashed)
  name: '系統管理員',
  role: 'admin',
  permissions: ['*'],
  isActive: true,
  createdAt: new Date().toISOString()
};

function ensureDataDir() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function loadUsers() {
  try {
    ensureDataDir();
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading demo users:', error);
  }
  // Return default admin if file doesn't exist
  return [DEFAULT_ADMIN];
}

function saveUsers(users) {
  try {
    ensureDataDir();
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving demo users:', error);
    return false;
  }
}

function getAllUsers() {
  return loadUsers().map(user => ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: user.permissions,
    isActive: user.isActive,
    createdAt: user.createdAt
  }));
}

function getUserByEmail(email) {
  const users = loadUsers();
  return users.find(u => u.email === email);
}

function getUserById(id) {
  const users = loadUsers();
  return users.find(u => u.id === parseInt(id));
}

function createUser(userData) {
  const users = loadUsers();

  // Check if email exists
  if (users.some(u => u.email === userData.email)) {
    throw new Error('此電子郵件已被使用');
  }

  // Generate new ID
  const maxId = users.reduce((max, u) => Math.max(max, u.id), 0);

  const newUser = {
    id: maxId + 1,
    email: userData.email,
    password: userData.password, // Store plain text for demo
    name: userData.name,
    role: userData.role || 'user',
    permissions: userData.permissions || [],
    isActive: true,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  saveUsers(users);

  return {
    id: newUser.id,
    email: newUser.email,
    name: newUser.name,
    role: newUser.role,
    permissions: newUser.permissions,
    isActive: newUser.isActive,
    createdAt: newUser.createdAt
  };
}

function updateUser(id, userData) {
  const users = loadUsers();
  const index = users.findIndex(u => u.id === parseInt(id));

  if (index === -1) {
    throw new Error('使用者不存在');
  }

  // Check email uniqueness if changing email
  if (userData.email && userData.email !== users[index].email) {
    if (users.some(u => u.email === userData.email)) {
      throw new Error('此電子郵件已被使用');
    }
  }

  // Update user
  users[index] = {
    ...users[index],
    ...userData,
    id: users[index].id, // Preserve ID
    updatedAt: new Date().toISOString()
  };

  saveUsers(users);

  return {
    id: users[index].id,
    email: users[index].email,
    name: users[index].name,
    role: users[index].role,
    permissions: users[index].permissions,
    isActive: users[index].isActive
  };
}

function deleteUser(id) {
  const users = loadUsers();
  const index = users.findIndex(u => u.id === parseInt(id));

  if (index === -1) {
    throw new Error('使用者不存在');
  }

  // Prevent deleting the last admin
  const user = users[index];
  if (user.role === 'admin') {
    const adminCount = users.filter(u => u.role === 'admin').length;
    if (adminCount <= 1) {
      throw new Error('無法刪除最後一位管理員');
    }
  }

  users.splice(index, 1);
  saveUsers(users);

  return true;
}

function verifyPassword(user, password) {
  // For demo mode, compare plain text
  return user.password === password;
}

module.exports = {
  getAllUsers,
  getUserByEmail,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  verifyPassword,
  DEFAULT_ADMIN
};
