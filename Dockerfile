FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

FROM nginx:1.29-alpine AS runtime
RUN apk update && apk upgrade --no-cache && rm -rf /var/cache/apk/*
RUN sed -i 's/user  nginx;//g' /etc/nginx/nginx.conf || true
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
    && mkdir -p /tmp/nginx_client /tmp/nginx_proxy /tmp/nginx_fastcgi \
                /tmp/nginx_uwsgi /tmp/nginx_scgi \
    && chown -R nginx:nginx /usr/share/nginx/html \
    && chmod -R 755 /usr/share/nginx/html
USER nginx
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
