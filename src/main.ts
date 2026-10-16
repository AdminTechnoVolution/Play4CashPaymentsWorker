import 'reflect-metadata';
import 'dotenv/config';
import { createServer } from 'node:http';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { NestFactory } from '@nestjs/core';
import type { Connection } from 'mongoose';
import { LedgerService } from './shared/modules/payments/ledger.service';
import { PaymentsService } from './shared/modules/payments/payments.service';
import { PaymentsPolicy } from './shared/modules/payments/payments-policy.service';
import { NowPaymentsClient } from './shared/modules/payments/nowpayments.client';
import { PaymentsWorker } from './shared/modules/payments/payments.worker';
import { EmailModule } from './shared/common/email/email.module';
import { validateEnvironment, createHealthHandler, ConfigurationError } from './configuration';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [() => ({ email: {
      service: process.env.EMAIL_SERVICE, from: process.env.EMAIL_FROM, pass: process.env.EMAIL_PASS,
    } })] }),
    MongooseModule.forRootAsync({ inject: [ConfigService], useFactory: (c: ConfigService) => ({
      uri: c.get<string>('MONGO_URI'), serverSelectionTimeoutMS: 10000,
    }) }),
    ScheduleModule.forRoot(), EmailModule,
  ],
  providers: [LedgerService, PaymentsService, PaymentsPolicy, NowPaymentsClient, PaymentsWorker],
})
class WorkerModule {}

async function main(): Promise<void> {
  validateEnvironment(process.env);
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const db = app.get<Connection>(getConnectionToken());
  let stopping = false;
  const server = createServer(createHealthHandler(async () => {
    if (stopping || db.readyState !== 1 || !db.db) return false;
    await db.db.command({ ping: 1 }, { timeoutMS: 2000 });
    return true;
  }));
  const port = Number(process.env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválido');
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', resolve);
  });
  console.log(`P4C payments worker started; health endpoint listening on port ${port}; sandbox only`);
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    server.close();
    const deadline = setTimeout(() => process.exit(1), 15000);
    deadline.unref();
    await app.close();
    clearTimeout(deadline);
  };
  process.once('SIGTERM', () => { void shutdown(); });
  process.once('SIGINT', () => { void shutdown(); });
}
void main().catch((error: unknown) => {
  // Do not serialize driver/provider errors: they can contain connection credentials.
  console.error(error instanceof ConfigurationError ? error.message : 'Worker no pudo iniciar. Revisar acceso MongoDB y configuración.');
  process.exit(1);
});
