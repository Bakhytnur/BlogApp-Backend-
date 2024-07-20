const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authenticateToken = require('./middleware/auth');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 5003;
const SECRET_KEY = 'your_secret_key';

//app.use(bodyParser.json());

app.use(bodyParser.json({ limit: '10mb' })); // можно указать другой лимит, например, '50mb'
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
app.use(cors());

// Маршруты без авторизации
app.post('/api/register', async (req, res) => {
  const { username, password, city, fio, address, date_of_birth } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const newUser = await db.one(
      'INSERT INTO users(id, username, password, city, FIO, address, date_of_birth) VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [uuidv4(), username, hashedPassword, city, fio, address, date_of_birth]
    );
    const token = jwt.sign({ id: newUser.id, username: newUser.username }, SECRET_KEY);
    res.status(201).json({ token });
  } catch (err) {
    console.error('Error registering user:', err);
    res.status(500).send('Server error');
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await db.oneOrNone('SELECT * FROM users WHERE username = $1', [username]);
    if (user && await bcrypt.compare(password, user.password)) {
      const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY);
      res.json({ ...user, token });
      //res.json({ token }); 
    } else {
      res.status(401).send('Invalid credentials');
    }
  } catch (err) {
    console.error('Error logging in:', err);
    res.status(500).send('Server error');
  }
});

// Защищенные маршруты
app.get('/api/posts', authenticateToken, async (req, res) => {
  const user_id = req.user.id;
  const { page = 1, pageSize = 10 } = req.query;
  const offset = (page - 1) * pageSize;

  try {
    //const posts = await db.any('SELECT * FROM posts');
    //res.json(posts);

    const posts = await db.any(`
      SELECT p.*,
        COALESCE(array_agg(f.user_id::text) FILTER (WHERE f.user_id IS NOT NULL), '{}') as user_id_favourites,
        COALESCE(array_agg(pl.user_id::text) FILTER (WHERE pl.user_id IS NOT NULL), '{}') as user_id_likes,
        EXISTS (
          SELECT 1
          FROM post_likes pl2
          WHERE pl2.post_id = p.id::text AND pl2.user_id = $3
        ) as liked,
        EXISTS (
          SELECT 1
          FROM post_favourites pf2
          WHERE pf2.post_id = p.id::text AND pf2.user_id = $3
        ) as marked_favourite
      FROM posts p
      LEFT JOIN post_favourites f ON p.id = f.post_id
      LEFT JOIN post_likes pl ON p.id = pl.post_id
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT $1 OFFSET $2
    `, [pageSize, offset, user_id]); //, [user_id]);
    res.json(posts);
  } catch (err) {
    console.error('Error fetching posts:', err);
    res.status(500).send('Server error');
  }
});

app.get('/api/posts/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;
  try {
    //const post = await db.oneOrNone('SELECT * FROM posts WHERE id = $1', [id]);
    //if (post) {
      ///res.json(post);
      //const likes = await db.oneOrNone('SELECT COUNT(*) AS like_count FROM post_likes WHERE post_id = $1', [id]);
      //res.json({ ...post, like_count: likes ? likes.like_count : 0 });  
    //} else {
      //res.status(404).send('Post not found');
    //}

    const post = await db.oneOrNone(`
      SELECT p.*, COALESCE(f.favourite_post, false) as favourite
      FROM posts p
      LEFT JOIN post_favourites f ON p.id = f.post_id AND f.user_id = $1
      WHERE p.id = $2
    `, [user_id, id]);
    if (post) {
      const likes = await db.oneOrNone('SELECT COUNT(*) AS like_count FROM post_likes WHERE post_id = $1', [id]);
      res.json({ ...post, like_count: likes ? likes.like_count : 0 });
    } else {
      res.status(404).send('Post not found');
    }
  } catch (err) {
    console.error('Error fetching post:', err);
    res.status(500).send('Server error');
  }
});

app.post('/api/posts', authenticateToken, async (req, res) => {
  //const { title, body } = req.body;
  const id = uuidv4(); // Генерируем UUID для идентификатора поста
  const { title, body, favourite, user_id, like_increment } = req.body;
  const created_at = new Date();
  const newPost = { id, title, body, favourite, user_id, created_at, like_increment };

  try {
    //const newPost = await db.one(
      //'INSERT INTO posts(id, title, body) VALUES($1, $2, $3) RETURNING *',
      //[id, title, body]
    //);
    const newPost = await db.one(`
      INSERT INTO posts (id, title, body, favourite, user_id, created_at, like_increment)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `, [id, title, body, favourite, user_id, created_at, like_increment]);
    console.log(newPost);

    const user_id_likes = [];
    const user_id_favourites = [];

    const fullNewPost = {
      ...newPost,
      user_id_likes,
      user_id_favourites
    };

    res.status(201).json(fullNewPost);
  } catch (err) {
    console.error('Error adding post:', err);
    res.status(500).send('Server error');
  }
});

app.put('/api/posts/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  //const { title, body } = req.body;
  const { title, body, favourite, user_id, created_at, like_increment } = req.body;
  try {
    //const updatedPost = await db.one(
      //'UPDATE posts SET title = $1, body = $2 WHERE id = $3 RETURNING *',
      //[title, body, id]
    //);
    //const updatedPost = await db.one('UPDATE posts SET ? WHERE id = ?', [{ title, body, favourite, like_increment }, id]);
    const updatedPost = await db.one(`
      UPDATE posts 
      SET title = $1, body = $2, favourite = $3, user_id = $4, created_at = $5, like_increment = $6
      WHERE id = $7::TEXT
      RETURNING *;
    `, [title, body, favourite, user_id, created_at, like_increment, id]);
    console.log(updatedPost);
    // Получаем количество лайков для обновленного поста
    const likes = await db.oneOrNone('SELECT COUNT(*) AS like_count FROM post_likes WHERE post_id = $1', [id]);
    updatedPost.like_count = likes ? likes.like_count : 0;

    //res.json(updatedPost);
    res.status(200).json(updatedPost);
  } catch (err) {
    console.error('Error updating post:', err);
    res.status(500).send('Server error');
  }
});

app.delete('/api/posts/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.none('DELETE FROM posts WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting post:', err);
    res.status(500).send('Server error');
  }
});

app.put('/api/posts/:id/favourite', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { favourite } = req.body; // Expecting { favourite: true/false }
  const userId = req.user.id;
  try {
    //const updatedPost = await db.one(
      //'UPDATE posts SET favourite = $1 WHERE id = $2 RETURNING *',
      //[favourite, id]
    //);
    //console.log('updated post', updatedPost);
    //res.json(updatedPost);

    const existingFavourite = await db.oneOrNone('SELECT * FROM post_favourites WHERE post_id = $1 AND user_id = $2', [id, userId]);
    let favourite;

    console.log(existingFavourite)

    if (existingFavourite) {
      //const updatedFavourite = await db.one(
        //'UPDATE post_favourites SET favourite = $1 WHERE post_id = $2 AND user_id = $3 RETURNING *',
        //[favourite, id, userId]
      //);
      //res.json(updatedFavourite);

      await db.none('DELETE FROM post_favourites WHERE post_id = $1 AND user_id = $2', [id, userId]);
      const result = await db.one('UPDATE posts SET favourite = false WHERE id = $1 RETURNING favourite', [id]);
      favourite = result.favourite;
    } else {
      //const newFavourite = await db.one(
        //'INSERT INTO post_favourites(id, user_id, post_id, favourite) VALUES($1, $2, $3, $4) RETURNING *',
        //[uuidv4(), userId, id, favourite]
      //);
      //res.json(newFavourite);

      await db.none('INSERT INTO post_favourites(id, post_id, user_id, favourite_post) VALUES ($1, $2, $3, $4)', [uuidv4(), id, userId, true]);
      const result = await db.one('UPDATE posts SET favourite = true WHERE id = $1 RETURNING favourite', [id]);
      favourite = result.favourite;
    }

    res.json({ favourite: favourite });

  } catch (err) {
    console.error('Error updating post favourite:', err);
    res.status(500).send('Server error');
  }
});

app.put('/api/posts/:id/like', authenticateToken, async (req, res) => {
  const { id } = req.params;
  //const { like_increment } = req.body;
  //const userId = req.user.id;
  const { userId } = req.body;
  console.log(userId);

  try {
    //const updatedPost = await db.one(
      //'UPDATE posts SET like_increment = $1 WHERE id = $2 RETURNING *',
      //[like_increment, id]
    //);
    //res.json(updatedPost);

    const existingLike = await db.oneOrNone('SELECT * FROM post_likes WHERE post_id = $1 AND user_id = $2', [id, userId]);
    let likeIncrement;
    let liked;

    //if (existingLike.rows.length > 0) {
    console.log('existingLike', existingLike);

    if (existingLike) {
      await db.none('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [id, userId]);
      const result = await db.one('UPDATE posts SET like_increment = like_increment - 1 WHERE id = $1 RETURNING like_increment', [id]);
      likeIncrement = result.like_increment;
      liked = false;
    } else {
      await db.none('INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2)', [id, userId]);
      const result = await db.one('UPDATE posts SET like_increment = like_increment + 1 WHERE id = $1 RETURNING like_increment', [id]);
      likeIncrement = result.like_increment;
      liked = true;
    }

    //res.json(result.rows[0]);
    res.json({ like_increment: likeIncrement, liked: liked });

  } catch (err) {
    console.error('Error updating post like increment:', err);
    res.status(500).send('Server error');
  }
});

//post_like methods
app.post('/api/posts/:id/post_like', authenticateToken, async (req, res) => {
  const { postId } = req.params;
  const userId = req.user.id; // Используем id пользователя из токена

  try {
    const like = await db.one(
      'INSERT INTO post_likes(post_id, user_id) VALUES($1, $2) RETURNING *',
      [postId, userId]
    );
    res.status(201).json(like);
  } catch (err) {
    console.error('Error adding like:', err);
    res.status(500).send('Server error');
  }
});

app.delete('/api/posts/:id/post_like', authenticateToken, async (req, res) => {
  const { postId } = req.params;
  const userId = req.user.id; // Используем id пользователя из токена

  try {
    await db.none('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [postId, userId]);
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting like:', err);
    res.status(500).send('Server error');
  }
});

app.get('/api/posts/:id/post_likes', authenticateToken, async (req, res) => {
  const { postId } = req.params;

  try {
    const likes = await db.any('SELECT * FROM post_likes WHERE post_id = $1', [postId]);
    res.json(likes);
  } catch (err) {
    console.error('Error fetching likes:', err);
    res.status(500).send('Server error');
  }
});

app.post('/api/pictureposts', authenticateToken, async (req, res) => {
  const { image_url, description } = req.body;
  const user_id = req.user.id; // Используем id пользователя из токена
  const id = uuidv4();

  try {
    const newPost = await db.one(
      'INSERT INTO picture_posts(id, image_url, description, user_id) VALUES($1, $2, $3, $4) RETURNING *',
      [id, image_url, description, user_id]
    );
    res.status(201).json(newPost);
  } catch (err) {
    console.error('Error adding picture post:', err);
    res.status(500).send('Server error');
  }
});

app.get('/api/pictureposts', authenticateToken, async (req, res) => {
  const user_id = req.user.id;
  const { page = 1, picturePageSize = 5 } = req.query;
  const offset = (page - 1) * picturePageSize;

  try {
    //const picturePosts = await db.any('SELECT * FROM picture_posts');
    //res.json(picturePosts);
    const pictureposts = await db.any(`
      SELECT p.*,
        COALESCE(array_agg(f.user_id::text) FILTER (WHERE f.user_id IS NOT NULL), '{}') as user_id_favourites,
        COALESCE(array_agg(pl.user_id::text) FILTER (WHERE pl.user_id IS NOT NULL), '{}') as user_id_likes,
        EXISTS (
          SELECT 1
          FROM picture_post_likes pl2
          WHERE pl2.post_id = p.id::text AND pl2.user_id = $3
        ) as liked,
        EXISTS (
          SELECT 1
          FROM post_favourites pf2
          WHERE pf2.post_id = p.id::text AND pf2.user_id = $3
        ) as marked_favourite
      FROM picture_posts p
      LEFT JOIN post_favourites f ON p.id::text = f.post_id
      LEFT JOIN picture_post_likes pl ON p.id::text = pl.post_id
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT $1 OFFSET $2
    `, [picturePageSize, offset, user_id]); //, [user_id]);
    res.json(pictureposts);
  } catch (err) {
    console.error('Error fetching picture posts:', err);
    res.status(500).send('Server error');
  }
});

app.get('/api/pictureposts/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const picturePost = await db.oneOrNone('SELECT * FROM picture_posts WHERE id = $1', [id]);
    if (picturePost) {
      //res.json(picturePost);
      const likes = await db.oneOrNone('SELECT COUNT(*) AS like_count FROM post_likes WHERE post_id = $1', [id]);
      res.json({ ...picturePost, like_count: likes ? likes.like_count : 0 });
    } else {
      res.status(404).send('Picture post not found');
    }
  } catch (err) {
    console.error('Error fetching picture post:', err);
    res.status(500).send('Server error');
  }
});

app.put('/api/pictureposts/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { image_url, description } = req.body;
  try {
    const updatedPicturePost = await db.one(
      'UPDATE picture_posts SET image_url = $1, description = $2 WHERE id = $3 RETURNING *',
      [image_url, description, id]
    );
    res.json(updatedPicturePost);
  } catch (err) {
    console.error('Error updating picture post:', err);
    res.status(500).send('Server error');
  }
});

app.delete('/api/pictureposts/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.none('DELETE FROM picture_posts WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting picture post:', err);
    res.status(500).send('Server error');
  }
});

app.put('/api/pictureposts/:id/like', authenticateToken, async (req, res) => {
  const { id } = req.params;
  //const { like_increment } = req.body;
  //const userId = req.user.id;
  const { userId } = req.body;

  try {
    //const updatedPost = await db.one(
      //'UPDATE picture_posts SET like_increment = $1 WHERE id = $2 RETURNING *',
      //[like_increment, id]
    //);
    //res.json(updatedPost);

    const existingLike = await db.oneOrNone('SELECT * FROM picture_post_likes WHERE post_id = $1 AND user_id = $2', [id, userId]);
    let likeIncrement;
    let liked;

    //if (existingLike.rows.length > 0) {
    if (existingLike) {
      await db.none('DELETE FROM picture_post_likes WHERE post_id = $1 AND user_id = $2', [id, userId]);
      const result = await db.one('UPDATE picture_posts SET like_increment = like_increment - 1 WHERE id = $1 RETURNING like_increment', [id]);
      likeIncrement = result.like_increment;
      liked = false;
    } else {
      await db.none('INSERT INTO picture_post_likes (post_id, user_id) VALUES ($1, $2)', [id, userId]);
      const result = await db.one('UPDATE picture_posts SET like_increment = like_increment + 1 WHERE id = $1 RETURNING like_increment', [id]);
      likeIncrement = result.like_increment;
      liked = true;
    }

    //res.json(result.rows[0]);
    res.json({ like_increment: likeIncrement, liked: liked });

  } catch (err) {
    console.error('Error updating picture post like increment:', err);
    res.status(500).send('Server error');
  }
});

app.put('/api/pictureposts/:id/favourite', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { favourite } = req.body; // Expecting { favourite: true/false }
  const userId = req.user.id;
  try {
    //const updatedPicturePost = await db.one(
      //'UPDATE picture_posts SET favourite = $1 WHERE id = $2 RETURNING *',
      //[favourite, id]
    //);
    //console.log('updated picture post', updatedPicturePost);
    //res.json(updatedPicturePost);

    const existingFavourite = await db.oneOrNone('SELECT * FROM post_favourites WHERE post_id = $1 AND user_id = $2', [id, userId]);
    let favourite;
  
    console.log(existingFavourite)
  
    if (existingFavourite) {
      await db.none('DELETE FROM post_favourites WHERE post_id = $1 AND user_id = $2', [id, userId]);
      const result = await db.one('UPDATE picture_posts SET favourite = false WHERE id = $1 RETURNING favourite', [id]);
      favourite = result.favourite;
    } else {
      await db.none('INSERT INTO post_favourites(id, post_id, user_id, favourite_post) VALUES ($1, $2, $3, $4)', [uuidv4(), id, userId, true]);
      const result = await db.one('UPDATE picture_posts SET favourite = true WHERE id = $1 RETURNING favourite', [id]);
      favourite = result.favourite;
    }
  
    res.json({ favourite: favourite });
  } catch (err) {
    console.error('Error updating picture post favourite:', err);
    res.status(500).send('Server error');
  }
});

//post_likes
app.post('/api/pictureposts/:id/picture_post_like', authenticateToken, async (req, res) => {
  const { postId } = req.params;
  const userId = req.user.id; // Используем id пользователя из токена

  try {
    const like = await db.one(
      'INSERT INTO picture_post_likes(post_id, user_id) VALUES($1, $2) RETURNING *',
      [postId, userId]
    );
    res.status(201).json(like);
  } catch (err) {
    console.error('Error adding like:', err);
    res.status(500).send('Server error');
  }
});

app.delete('/api/pictureposts/:id/picture_post_like', authenticateToken, async (req, res) => {
  const { postId } = req.params;
  const userId = req.user.id; // Используем id пользователя из токена

  try {
    await db.none('DELETE FROM picture_post_likes WHERE post_id = $1 AND user_id = $2', [postId, userId]);
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting like:', err);
    res.status(500).send('Server error');
  }
});

app.get('/api/favouriteposts', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { page = 1, favouritePageSize = 5 } = req.query;
  const offset = (page - 1) * favouritePageSize;
  console.log(userId);

  try {
    // Получаем избранные посты из таблицы posts
    const favouriteTextPosts = await db.any(`
      SELECT p.*,
        COALESCE(array_agg(f.user_id::text) FILTER (WHERE f.user_id IS NOT NULL), '{}') as user_id_favourites,
        COALESCE(array_agg(pl.user_id::text) FILTER (WHERE pl.user_id IS NOT NULL), '{}') as user_id_likes,
        EXISTS (
          SELECT 1
          FROM post_likes pl2
          WHERE pl2.post_id = p.id::text AND pl2.user_id = $1
        ) as liked,
        EXISTS (
          SELECT 1
          FROM post_favourites pf2
          WHERE pf2.post_id = p.id::text AND pf2.user_id = $1
        ) as marked_favourite
      FROM posts p
      LEFT JOIN post_favourites f ON p.id = f.post_id
      LEFT JOIN post_likes pl ON p.id = pl.post_id
      WHERE f.user_id = $1 AND f.favourite_post = true
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, favouritePageSize, offset]); //, [userId]);

    // Получаем избранные посты из таблицы picture_posts
    const favouritePicturePosts = await db.any(`
      SELECT pp.*,
        COALESCE(array_agg(f.user_id::text) FILTER (WHERE f.user_id IS NOT NULL), '{}') as user_id_favourites,
        COALESCE(array_agg(pl.user_id::text) FILTER (WHERE pl.user_id IS NOT NULL), '{}') as user_id_likes,
        EXISTS (
          SELECT 1
          FROM picture_post_likes pl2
          WHERE pl2.post_id = pp.id::text AND pl2.user_id = $1
        ) as liked,
        EXISTS (
          SELECT 1
          FROM post_favourites pf2
          WHERE pf2.post_id = pp.id::text AND pf2.user_id = $1
        ) as marked_favourite
      FROM picture_posts pp
      LEFT JOIN post_favourites f ON pp.id::text = f.post_id
      LEFT JOIN picture_post_likes pl ON pp.id::text = pl.post_id
      WHERE f.user_id = $1 AND f.favourite_post = true
      GROUP BY pp.id
      LIMIT $2 OFFSET $3
    `, [userId, favouritePageSize, offset]); //, [userId]);

    // Объединяем оба массива в один
    const favouritePosts = favouriteTextPosts.concat(favouritePicturePosts);
    //console.log(favouritePosts);
    console.log(favouriteTextPosts);
    console.log(favouritePicturePosts);

    res.json(favouritePosts);
  } catch (err) {
    console.error('Error fetching favourite posts:', err);
    res.status(500).send('Server error');
  }
});

app.get('/api/user/profile', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const userProfile = await db.oneOrNone('SELECT id, username, FIO, city, address, date_of_birth FROM users WHERE id = $1', [userId]);
    if (userProfile) {
      res.json(userProfile);
    } else {
      res.status(404).send('User profile not found');
    }
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).send('Server error');
  }
});

app.put('/api/users/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { username, city, fio, address, date_of_birth } = req.body;
  const userId = req.user.id;

  // Проверяем, что пользователь обновляет свои данные
  if (id !== userId) {
    return res.status(403).send('Forbidden');
  }

  try {
    const updatedUser = await db.one(
      'UPDATE users SET username = $1, city = $2, FIO = $3, address = $4, date_of_birth = $5 WHERE id = $6 RETURNING *',
      [username, city, fio, address, date_of_birth, id]
    );
    res.json(updatedUser);
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).send('Server error');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
