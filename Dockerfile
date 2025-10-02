FROM nginx:1.20.2
ADD nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
COPY dist /usr/share/nginx/html
CMD ["/docker-entrypoint.sh"]
#ADD oauth2 /usr/share/nginx/html/oauth2
