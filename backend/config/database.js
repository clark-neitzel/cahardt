const { PrismaClient } = require('@prisma/client');

let datasourceUrl = process.env.DATABASE_URL;
if (datasourceUrl) {
    if (!datasourceUrl.includes('connection_limit')) {
        datasourceUrl += (datasourceUrl.includes('?') ? '&' : '?') + 'connection_limit=50';
    }
    if (!datasourceUrl.includes('pool_timeout')) {
        datasourceUrl += '&pool_timeout=20';
    }
}

const prisma = new PrismaClient(datasourceUrl ? {
    datasources: {
        db: {
            url: datasourceUrl
        }
    }
} : undefined);

module.exports = prisma;
