import { defineConfig } from '@prisma/config';
import dotenv from 'dotenv'
dotenv.config()

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL!,
    directUrl: process.env.DATABASE_URL!,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
  engine: 'classic',
});
