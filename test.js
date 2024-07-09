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

  app.get('/api/posts', authenticateToken, async (req, res) => {
    const user_id = req.user.id;
    try {
      //const posts = await db.any('SELECT * FROM posts');
      //res.json(posts);
  
      const posts = await db.any(`
        SELECT p.*, COALESCE(f.favourite_post, false) as favourite
        FROM posts p
        LEFT JOIN post_favourites f ON p.id = f.post_id AND f.user_id = $1
      `, [user_id]);
      res.json(posts);
    } catch (err) {
      console.error('Error fetching posts:', err);
      res.status(500).send('Server error');
    }
  });