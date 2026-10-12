FROM alpine:3.22@sha256:5291449c3df73caf6ed85e649dec1b9e818b39a5d8c871e97afc13e9cd5e8fa8

RUN apk add --no-cache curl python3 jq bind-tools \
 && adduser -D -u 10002 -h /home/attacker attacker

USER 10002:10002
WORKDIR /home/attacker

CMD ["sleep", "infinity"]
