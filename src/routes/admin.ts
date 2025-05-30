import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import * as schema from '../db/schema';
import { html } from 'hono/html';

type Variables = {
  user: {
    id: string;
    email: string;
    name: string;
  };
};

const admin = new Hono<{ Bindings: Env; Variables: Variables }>();

// Import admin middleware for protected routes
import { adminMiddleware } from '../middleware/admin';

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  isAdmin: z.boolean().optional().default(false),
});

// GET /admin/login - Admin login page
admin.get('/login', async (c) => {
  const loginHtml = html`
<!DOCTYPE html>
<html>
<head>
    <title>Admin Login - Journal API</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        .login-form { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 8px; font-weight: 500; }
        input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        .btn { width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
        .btn:hover { background: #0056b3; }
        .error { color: #dc3545; margin-top: 10px; }
        h1 { text-align: center; margin-bottom: 30px; color: #333; }
    </style>
</head>
<body>
    <div class="login-form">
        <h1>管理者ログイン</h1>
        <form id="loginForm">
            <div class="form-group">
                <label for="email">メールアドレス</label>
                <input type="email" id="email" name="email" required>
            </div>
            <div class="form-group">
                <label for="password">パスワード</label>
                <input type="password" id="password" name="password" required>
            </div>
            <button type="submit" class="btn">ログイン</button>
            <div id="error" class="error" style="display: none;"></div>
        </form>
    </div>

    <script>
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const credentials = {
                email: formData.get('email'),
                password: formData.get('password')
            };
            
            const errorDiv = document.getElementById('error');
            errorDiv.style.display = 'none';
            
            try {
                const response = await fetch('/admin/auth', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(credentials)
                });
                
                if (response.ok) {
                    window.location.href = '/admin';
                } else {
                    const error = await response.json();
                    errorDiv.textContent = error.error || 'ログインに失敗しました';
                    errorDiv.style.display = 'block';
                }
            } catch (error) {
                errorDiv.textContent = 'ログインに失敗しました: ' + error.message;
                errorDiv.style.display = 'block';
            }
        });
    </script>
</body>
</html>`;
  
  return c.html(loginHtml);
});

// POST /admin/auth - Admin authentication
admin.post('/auth', async (c) => {
  const { email, password } = await c.req.json();
  const db = drizzle(c.env.DB, { schema });

  // For bootstrap admin users who don't have passwords yet
  if (!password) {
    return c.json({ error: 'Password is required' }, 400);
  }

  // Check if user exists and is admin
  const user = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      isAdmin: schema.users.isAdmin,
    })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (!user[0] || !user[0].isAdmin) {
    return c.json({ error: 'Invalid credentials or insufficient permissions' }, 401);
  }

  // For simplicity, create a simple session
  // In production, you should use proper authentication
  const sessionToken = btoa(JSON.stringify({ userId: user[0].id, email: user[0].email, name: user[0].name }));
  
  // Set cookie
  c.header('Set-Cookie', `admin_session=${sessionToken}; HttpOnly; Path=/; Max-Age=86400`);
  
  return c.json({ user: user[0] });
});

// POST /admin/logout - Admin logout
admin.post('/logout', async (c) => {
  // Clear the admin session cookie
  c.header('Set-Cookie', 'admin_session=; HttpOnly; Path=/; Max-Age=0');
  
  return c.json({ message: 'Logged out successfully' });
});

// GET /admin - Admin dashboard HTML
admin.get('/', async (c) => {
  // Check for simple session cookie
  const cookies = c.req.header('Cookie') || '';
  const sessionMatch = cookies.match(/admin_session=([^;]+)/);
  
  if (!sessionMatch) {
    return c.redirect('/admin/login');
  }

  try {
    const session = JSON.parse(atob(sessionMatch[1]));
    c.set('user', session);
  } catch {
    return c.redirect('/admin/login');
  }

  const adminHtml = html`
<!DOCTYPE html>
<html>
<head>
    <title>Admin Dashboard - Journal API</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .section { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; }
        .btn-primary { background: #007bff; color: white; }
        .btn-danger { background: #dc3545; color: white; }
        .btn:hover { opacity: 0.8; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f8f9fa; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: 500; }
        input, select { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        .checkbox { width: auto; margin-right: 8px; }
        .status { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
        .status.verified { background: #d4edda; color: #155724; }
        .status.unverified { background: #f8d7da; color: #721c24; }
        .status.admin { background: #d1ecf1; color: #0c5460; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h1>Journal API - Admin Dashboard</h1>
                    <p>管理者用のダッシュボードです。ユーザーの管理を行えます。</p>
                </div>
                <button onclick="logout()" class="btn btn-danger">ログアウト</button>
            </div>
        </div>

        <div class="section">
            <h2>新規ユーザー作成</h2>
            <form id="createUserForm">
                <div class="form-group">
                    <label for="email">メールアドレス</label>
                    <input type="email" id="email" name="email" required>
                </div>
                <div class="form-group">
                    <label for="name">名前</label>
                    <input type="text" id="name" name="name" required>
                </div>
                <div class="form-group">
                    <small style="color: #666;">※ パスワードは初回サインイン時にユーザーが設定します</small>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="isAdmin" name="isAdmin" class="checkbox">
                        管理者権限を付与する
                    </label>
                </div>
                <button type="submit" class="btn btn-primary">ユーザー作成</button>
            </form>
        </div>

        <div class="section">
            <h2>ユーザー一覧</h2>
            <button onclick="loadUsers()" class="btn btn-primary" style="margin-bottom: 15px;">一覧を更新</button>
            <div id="usersTable">読み込み中...</div>
        </div>
    </div>

    <script>
        async function loadUsers() {
            try {
                const response = await fetch('/admin/users');
                const users = await response.json();
                
                const tableHtml = \`
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>名前</th>
                                <th>メールアドレス</th>
                                <th>ステータス</th>
                                <th>作成日時</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            \${users.map(user => \`
                                <tr>
                                    <td>\${user.id.substring(0, 8)}...</td>
                                    <td>\${user.name}</td>
                                    <td>\${user.email}</td>
                                    <td>
                                        \${user.isAdmin ? '<span class="status admin">管理者</span>' : ''}
                                        \${user.emailVerified ? '<span class="status verified">認証済</span>' : '<span class="status unverified">未認証</span>'}
                                    </td>
                                    <td>\${new Date(user.createdAt).toLocaleString('ja-JP')}</td>
                                    <td>
                                        <button onclick="deleteUser('\${user.id}')" class="btn btn-danger">削除</button>
                                    </td>
                                </tr>
                            \`).join('')}
                        </tbody>
                    </table>
                \`;
                document.getElementById('usersTable').innerHTML = tableHtml;
            } catch (error) {
                document.getElementById('usersTable').innerHTML = 'エラーが発生しました: ' + error.message;
            }
        }

        async function deleteUser(userId) {
            if (!confirm('このユーザーを削除してもよろしいですか？この操作は取り消せません。')) {
                return;
            }
            
            try {
                const response = await fetch(\`/admin/users/\${userId}\`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    alert('ユーザーを削除しました');
                    loadUsers();
                } else {
                    const error = await response.json();
                    alert('削除に失敗しました: ' + error.error);
                }
            } catch (error) {
                alert('削除に失敗しました: ' + error.message);
            }
        }

        document.getElementById('createUserForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const userData = {
                email: formData.get('email'),
                name: formData.get('name'),
                isAdmin: formData.get('isAdmin') === 'on'
            };
            
            try {
                const response = await fetch('/admin/users', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(userData)
                });
                
                if (response.ok) {
                    alert('ユーザーを作成しました');
                    e.target.reset();
                    loadUsers();
                } else {
                    const error = await response.json();
                    alert('作成に失敗しました: ' + error.error);
                }
            } catch (error) {
                alert('作成に失敗しました: ' + error.message);
            }
        });

        async function logout() {
            try {
                const response = await fetch('/admin/logout', {
                    method: 'POST'
                });
                
                if (response.ok) {
                    window.location.href = '/admin/login';
                } else {
                    alert('ログアウトに失敗しました');
                }
            } catch (error) {
                alert('ログアウトに失敗しました: ' + error.message);
            }
        }

        // 初期ロード
        loadUsers();
    </script>
</body>
</html>`;
  
  return c.html(adminHtml);
});

// GET /admin/users - Get all users (API)
admin.get('/users', adminMiddleware, async (c) => {
  const db = drizzle(c.env.DB, { schema });

  const allUsers = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      emailVerified: schema.users.emailVerified,
      isAdmin: schema.users.isAdmin,
      image: schema.users.image,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt));

  return c.json(allUsers);
});

// POST /admin/users - Create new user
admin.post('/users', adminMiddleware, zValidator('json', createUserSchema), async (c) => {
  const { email, name, isAdmin } = c.req.valid('json');
  const db = drizzle(c.env.DB, { schema });

  try {
    // Check if user already exists
    const existingUser = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      return c.json({ error: 'User with this email already exists' }, 400);
    }

    // Create user directly in database (bypassing better-auth for admin creation)
    // Note: Password will be set when user first signs in via better-auth
    const newUser = await db
      .insert(schema.users)
      .values({
        email,
        name,
        emailVerified: true, // Admin-created users are pre-verified
        isAdmin,
      })
      .returning({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        isAdmin: schema.users.isAdmin,
        emailVerified: schema.users.emailVerified,
        createdAt: schema.users.createdAt,
      });

    return c.json(newUser[0], 201);
  } catch (error) {
    console.error('User creation error:', error);
    return c.json({ error: 'Failed to create user' }, 500);
  }
});

// DELETE /admin/users/:id - Delete user
admin.delete('/users/:id', adminMiddleware, async (c) => {
  const userId = c.req.param('id');
  const db = drizzle(c.env.DB, { schema });

  try {
    // Check if user exists
    const userToDelete = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!userToDelete[0]) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Delete user and related data in transaction
    await db.transaction(async (tx) => {
      // Delete attachments metadata
      await tx
        .delete(schema.attachments)
        .where(
          eq(
            schema.attachments.journalEntryId,
            tx
              .select({ id: schema.journalEntries.id })
              .from(schema.journalEntries)
              .where(eq(schema.journalEntries.userId, userId))
          )
        );

      // Delete journal entries
      await tx
        .delete(schema.journalEntries)
        .where(eq(schema.journalEntries.userId, userId));

      // Delete OAuth tokens
      await tx
        .delete(schema.oauthTokens)
        .where(eq(schema.oauthTokens.userId, userId));

      // Delete sessions
      await tx
        .delete(schema.sessions)
        .where(eq(schema.sessions.userId, userId));

      // Delete user
      await tx.delete(schema.users).where(eq(schema.users.id, userId));
    });

    return c.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('User deletion error:', error);
    return c.json({ error: 'Failed to delete user' }, 500);
  }
});

export default admin;