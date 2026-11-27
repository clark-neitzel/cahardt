const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/mensagemAgendadaController');

// Tela "Mensagens" do menu é só admin (App.jsx `isAdmin`) e `/:id/disparar` manda WhatsApp para
// a equipe: antes QUALQUER usuário logado criava/editava/apagava/disparava. Agora só admin.
router.use((req, res, next) => {
    if (req.user?.permissoes?.admin !== true) {
        return res.status(403).json({ error: 'Apenas administradores podem gerenciar as mensagens agendadas.' });
    }
    next();
});

router.get('/', ctrl.listar);
router.get('/preview/:vendedorId', ctrl.preview);
router.get('/:id', ctrl.obter);
router.post('/', ctrl.criar);
router.put('/:id', ctrl.atualizar);
router.delete('/:id', ctrl.deletar);
router.post('/:id/disparar', ctrl.disparar);

module.exports = router;
