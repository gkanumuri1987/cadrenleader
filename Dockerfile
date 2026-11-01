FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json server.mjs event-workflows.mjs ./
COPY --chown=node:node public ./public
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=3100 DATABASE_PATH=/app/data/app.sqlite
EXPOSE 3100
VOLUME ["/app/data"]
CMD ["node", "server.mjs"]
