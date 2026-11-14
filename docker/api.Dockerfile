FROM node:22-alpine

ENV NODE_ENV=development
WORKDIR /app

COPY apps/api/ ./

EXPOSE 3000
# Start the API package when it is added; keep the environment available meanwhile.
CMD ["sh", "-c", "if [ -f package.json ]; then npm install && npm start; else echo 'Waiting for the API application.' && while true; do sleep 3600; done; fi"]
