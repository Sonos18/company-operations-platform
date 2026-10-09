FROM 728301184821.dkr.ecr.us-east-1.amazonaws.com/insta-compute-builds-us-east-1@sha256:fb6462ce8a6000a8e62dbf056b196157274deb59712024545aad90672ef17c02

ENV COREPACK_HOME=/opt/taskovia-runtime/corepack \
    COREPACK_ENABLE_AUTO_PIN=0
RUN corepack install -g pnpm@10.29.3 && corepack enable && test "$(pnpm --version)" = 10.29.3
ENV COREPACK_ENABLE_NETWORK=0

COPY profiles/materials/package.json profiles/materials/pnpm-lock.yaml /opt/taskovia-runtime/profiles/70a55d1926bd318c398835cf16a752d61fa80e59b00e1dea2241cb5574d7cb96/
COPY profiles/legacy/package.json profiles/legacy/pnpm-lock.yaml /opt/taskovia-runtime/profiles/2854a69099d243c4008d2d6310bcf60c88c14bf85d5f6805621803d22a1e5d86/
COPY start-worker.sh attach-runtime.sh /opt/taskovia-runtime/bin/

RUN set -eu; \
    echo '70a55d1926bd318c398835cf16a752d61fa80e59b00e1dea2241cb5574d7cb96  /opt/taskovia-runtime/profiles/70a55d1926bd318c398835cf16a752d61fa80e59b00e1dea2241cb5574d7cb96/pnpm-lock.yaml' | sha256sum -c -; \
    echo '2854a69099d243c4008d2d6310bcf60c88c14bf85d5f6805621803d22a1e5d86  /opt/taskovia-runtime/profiles/2854a69099d243c4008d2d6310bcf60c88c14bf85d5f6805621803d22a1e5d86/pnpm-lock.yaml' | sha256sum -c -; \
    for lock in 70a55d1926bd318c398835cf16a752d61fa80e59b00e1dea2241cb5574d7cb96 2854a69099d243c4008d2d6310bcf60c88c14bf85d5f6805621803d22a1e5d86; do \
      cd "/opt/taskovia-runtime/profiles/$lock"; \
      cp package.json package.original.json; \
      node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json","utf8"));delete p.scripts.postinstall;p.pnpm={...(p.pnpm||{}),onlyBuiltDependencies:["esbuild","unrs-resolver","vue-demi"]};fs.writeFileSync("package.json",JSON.stringify(p))'; \
      pnpm install --frozen-lockfile --prod=false --store-dir /opt/taskovia-runtime/store; \
      mv package.original.json package.json; \
    done; \
    echo '34bcdfe3022720e1d5cb58ebface18e597980a087330066dc63759f018d97284  /opt/taskovia-runtime/profiles/70a55d1926bd318c398835cf16a752d61fa80e59b00e1dea2241cb5574d7cb96/package.json' | sha256sum -c -; \
    echo 'd6a987882e43b0309833e13bb9530d6c3e2d8a48d88fbc16c6b9b71db52c3d70  /opt/taskovia-runtime/profiles/2854a69099d243c4008d2d6310bcf60c88c14bf85d5f6805621803d22a1e5d86/package.json' | sha256sum -c -; \
    chmod 0755 /opt/taskovia-runtime/bin/*.sh; \
    sh /opt/taskovia-runtime/bin/start-worker.sh --check; \
    for lock in 70a55d1926bd318c398835cf16a752d61fa80e59b00e1dea2241cb5574d7cb96 2854a69099d243c4008d2d6310bcf60c88c14bf85d5f6805621803d22a1e5d86; do \
      cd "/opt/taskovia-runtime/profiles/$lock"; \
      pnpm exec supabase --version; \
    done

CMD ["sh", "/opt/taskovia-runtime/bin/start-worker.sh"]
