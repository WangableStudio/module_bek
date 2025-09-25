const ApiError = require('../error/ApiError');

module.exports = function (err, req, res, next) {
    console.error(err); // Добавьте это для логирования ошибки в консоль
    if (err instanceof ApiError) {
        return res.status(err.status).json({ message: err.message });
    }
    return res.status(500).json({ message: 'Непредвиденная ошибка!' });
};