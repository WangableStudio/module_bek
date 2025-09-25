// middleware.js
const jwt = require('jsonwebtoken');

// Middleware для проверки токена и извлечения данных пользователя
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1]; // Получаем токен из заголовка Authorization

    if (!token) {
        return res.status(401).json({ message: 'Не авторизован' });
    }

    try {
        // Декодируем JWT токен
        const decoded = jwt.verify(token, process.env.SECRET_KEY); // Заменить на твой секретный ключ
        req.user = decoded; // Данные пользователя теперь в req.user
        next(); // Переходим к следующему middleware или обработчику
    } catch (error) {
        return res.status(403).json({ message: 'Invalid token' });
    }
}

module.exports = authMiddleware;