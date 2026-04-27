import { Logger } from '@aws-lambda-powertools/logger';
import type { ScheduledHandler } from 'aws-lambda';

const logger = new Logger({ serviceName: 'vigil-scanner' });

export const handler: ScheduledHandler = async (event) => {
  logger.info('scanner invoked', { event });
  // TODO(#15-#19): RDAP / TLS / DoH 取得 → DynamoDB 上書き → 期限判定 → SES dispatch
};
