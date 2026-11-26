const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const serverSession = crypto.randomBytes(32).toString('hex');

function signAuthToken(user, expiresIn) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, serverSession },
    process.env.JWT_SECRET,
    { expiresIn }
  );
}

function verifyAuthToken(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  if (payload.serverSession !== serverSession) {
    throw new jwt.JsonWebTokenError('Phiên đăng nhập thuộc lần chạy server trước');
  }
  return payload;
}

module.exports = { signAuthToken, verifyAuthToken };
