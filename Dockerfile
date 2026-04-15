FROM node:24-alpine AS build
WORKDIR /app
COPY package.json .
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

FROM nginx:1.29-alpine AS runtime
# Remove default nginx user config that requires root
RUN sed -i 's/user  nginx;//g' /etc/nginx/nginx.conf || true
# Copy our rootless config
COPY nginx/nginx.conf /etc/nginx/nginx.conf
# Copy built app
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
# Copy entrypoint that writes runtime config.json
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
# Create tmp dirs for nginx (rootless)
RUN mkdir -p /tmp/nginx_client /tmp/nginx_proxy /tmp/nginx_fastcgi \
    /tmp/nginx_uwsgi /tmp/nginx_scgi && \
    chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html
USER nginx
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
