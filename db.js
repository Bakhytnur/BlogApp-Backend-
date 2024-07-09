const pgp = require('pg-promise')();
const db = pgp('postgres://postgres:123123@localhost:5000/post_app2');

module.exports = db;
