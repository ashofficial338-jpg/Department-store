import { accountController } from '../controllers/accountController.js';
import crudRouter from '../utils/crudRouter.js';

export default crudRouter(accountController, {
  read: ['finance'],
  write: ['finance'],
  extra: (router, { canRead }) => router.get('/:id/ledger', canRead, accountController.accountLedger),
});
