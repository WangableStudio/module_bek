const Router = require('express')
const companyController = require('../controllers/companyController')
const authMiddleware = require('../middleware/middleware')
const router = new Router()

router.post('/create', authMiddleware, companyController.create)
router.get('/', companyController.getAll)
router.get('/:id', companyController.getOne)
router.put('/:id', companyController.update)
router.delete('/:id', companyController.delete)

module.exports = router