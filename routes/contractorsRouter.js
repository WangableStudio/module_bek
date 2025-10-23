const Router = require('express')
const router = new Router()
const contractorsController = require('../controllers/contractorsController')
const authMiddleware = require('../middleware/middleware')

router.post('/create', authMiddleware, contractorsController.create)
router.get('/', contractorsController.getAll)
router.get('/:id', contractorsController.getOne)
router.put('/:id', contractorsController.update)
router.delete('/:id', contractorsController.delete)

router.post('/register', contractorsController.registerPartner);
router.get('/GetSbpMembers', contractorsController.getBankName);

module.exports = router