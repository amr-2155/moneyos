#!/bin/bash
cd "C:/Users/A/Documents/New folder/moneyos"
export JWT_SECRET="${JWT_SECRET:-testsecret123}"
export PORT=3001
export HOST=127.0.0.1
export NODE_ENV=development
export CORS_ORIGIN=http://localhost:5173
export DATABASE_URL=./data/moneyos.db
export APP_NAME=MoneyOS
export DEFAULT_CURRENCY=EGP
export PUBLIC_APP_URL=http://localhost:5173
export MAILER_FROM="MoneyOS <no-reply@moneyos.local>"
PORT=3001 HOST=127.0.0.1 node dist/server.js