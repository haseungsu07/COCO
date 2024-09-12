const express = require('express');
const app = express();

require('dotenv').config()

app.use(express.static(__dirname + '/public'))
app.set('view engine', 'ejs')
app.use(express.json())
app.use(express.urlencoded({extended:true})) 

const session = require('express-session')
const passport = require('passport')
const LocalStrategy = require('passport-local')
const MongoStore = require('connect-mongo')

app.use(passport.initialize())
app.use(session({
  secret: 'ZXCVASDFQWERT',
  resave : false,
  saveUninitialized : false,
  store : MongoStore.create({
    mongoUrl : process.env.DBLINK,
    dbName : 'dobak'
  })
}))

app.use(passport.session()) 


const { MongoClient, ObjectId } = require('mongodb');

let db;
const url = process.env.DBLINK;
new MongoClient(url).connect().then((client)=>{
  console.log('DB연결성공')
  db = client.db('dobak');
  app.listen(8080, function(){
    console.log('listening on 8080')
})

}).catch((err)=>{
  console.log(err)
})

// 로그인

passport.use(new LocalStrategy(async (reqid, reqpw, cb) => {
  let result = await db.collection('user').findOne({ username : reqid})
  if (!result) {
    return cb(null, false, { message: '아이디 DB에 없음' })
  }
  if (result.password == reqpw) {
    return cb(null, result)
  } else {
    return cb(null, false, { message: '비번불일치' });
  }
}))

passport.serializeUser((user, done) => {
  process.nextTick(() => {
    done(null, { id: user._id, username: user.username })
  })
})

passport.deserializeUser(async (user, done) => {
  let result = await db.collection('user').findOne({_id : new ObjectId(user.id) })
  delete result.password
  process.nextTick(() => {
    return done(null, result)
  })
})

app.get('/login', (req, res) =>{
  res.render('login.ejs')
});

app.post('/login', async (req, res, next) => {
  passport.authenticate('local', (error, user, info) => {
    if (error) return res.status(500).json(error);
    if (!user) {
      return res.render('login.ejs', { errorMessage: info.message });
    }
    req.logIn(user, (err) => {
      if (err) return next(err);
      res.redirect('/');
    });
  })(req, res, next);
});

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

app.use(isLoggedIn)


app.use(async (req, res, next) => {
  res.locals.user = req.user || null;
  next();
});

// 메인페이지

app.get('/list', async (req,res) => {
  let result = await db.collection('posts').find().toArray()
  console.log(result)
  res.render('list.ejs', { posts : result })
});

app.get('/write', (req, res) =>{
  res.render('write.ejs')
});

app.post('/add', async (req,res) => {
  console.log(req.body)
  await db.collection('posts').insertOne({title : req.body.title, content : req.body.content})
  res.redirect('/list')
})

app.get('/', async (req,res) => {
  let result = await db.collection('posts').find().toArray()
  res.render('index.ejs', { posts : result })
});

app.get('/content', async (req,res) => {
  let result = await db.collection('posts').find().toArray()
  res.render('content.ejs', { posts : result })
});

app.post('/add-comment', async (req, res) => {
  try {
    const { postId, content } = req.body;
    const userId = req.user._id; // 현재 로그인한 사용자의 ID
    const username = req.user.username; // 현재 로그인한 사용자의 이름

    const newComment = {
      postId: new ObjectId(postId),
      userId: new ObjectId(userId),
      username: username,
      content: content,
      createdAt: new Date()
    };

    await db.collection('comments').insertOne(newComment);

    // 댓글 추가 후 원래 게시물 페이지로 리다이렉트
    res.redirect(`/detail/${postId}`);
  } catch (error) {
    console.error('댓글 추가 중 오류 발생:', error);
    res.status(500).send('댓글을 추가하는 중 오류가 발생했습니다.');
  }
});

// 게시물 상세 페이지 라우트 수정
app.get('/detail/:id', async (req, res) => {
  try {
    let result = await db.collection('posts').findOne({ _id : new ObjectId(req.params.id) });
    let comments = await db.collection('comments').find({ postId: new ObjectId(req.params.id) }).toArray();
    
    res.render('detail.ejs', { result : result, comments : comments, postId: req.params.id });
  } catch (error) {
    console.error('게시물 상세 정보 조회 중 오류 발생:', error);
    res.status(500).send('게시물을 불러오는 중 오류가 발생했습니다.');
  }
});

app.get('/about', (req, res) =>{
  res.render('about.ejs')
});

app.get('/mypage', (req, res) =>{
  res.render('mypage.ejs')
});

// 댓글 삭제 라우트
app.delete('/delete-comment/:id', async (req, res) => {
  try {
    const commentId = req.params.id;
    const userId = req.user._id;

    const result = await db.collection('comments').deleteOne({
      _id: new ObjectId(commentId),
      userId: new ObjectId(userId)
    });

    if (result.deletedCount === 0) {
      return res.status(403).json({ message: '댓글을 삭제할 권한이 없습니다.' });
    }

    res.json({ message: '댓글이 성공적으로 삭제되었습니다.' });
  } catch (error) {
    console.error('댓글 삭제 중 오류 발생:', error);
    res.status(500).json({ message: '댓글을 삭제하는 중 오류가 발생했습니다.' });
  }
});

// 로그아웃 라우트
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('세션 삭제 중 오류 발생:', err);
      return res.status(500).json({ message: '로그아웃 중 오류가 발생했습니다.' });
    }
    res.json({ message: '로그아웃 되었습니다.' });
  });
});
