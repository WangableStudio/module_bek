const Router = require('express')
const nomenclatureController = require('../controllers/nomenclatureController')
const authMiddleware = require('../middleware/middleware')
const router = new Router()

router.post('/create', authMiddleware, nomenclatureController.create)
router.get('/', nomenclatureController.getAll)
router.get('/:id', nomenclatureController.getOne)
router.put('/:id', nomenclatureController.update)
router.delete('/:id', nomenclatureController.delete)

module.exports = router