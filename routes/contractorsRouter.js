const Router = require('express')
const contractorsController = require('../controllers/contractorsController')
const authMiddleware = require('../middleware/middleware')
const router = new Router()

router.post('/create', authMiddleware, contractorsController.create)
router.get('/', contractorsController.getAll)
router.get('/:id', contractorsController.getOne)
router.put('/:id', contractorsController.update)
router.delete('/:id', contractorsController.delete)

module.exports = router