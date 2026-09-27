import { accountController } from '../controllers/accountController.js';
import crudRouter from '../utils/crudRouter.js';

export default crudRouter(accountController, {
  extra: (router) => router.get('/:id/ledger', accountController.accountLedger),
});
