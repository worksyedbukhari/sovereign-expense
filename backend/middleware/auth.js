const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  const authorization = req.header('Authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    if (!process.env.JWT_SECRET) return res.status(503).json({ error: 'Authentication unavailable' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!Number.isSafeInteger(decoded.id) || decoded.id < 1) {
      return res.status(401).json({ error: 'Invalid identity' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token.' });
  }
};

module.exports = authenticate;
