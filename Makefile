.DEFAULT_GOAL := help
MAKEFLAGS += --no-print-directory

.PHONY: help
# Add the following 'help' target to your Makefile
# And add help text after each target name starting with '\#\#'

help:
	@fgrep -h "##" $(MAKEFILE_LIST) | fgrep -v fgrep | sed -e 's/\\$$//' | sed -e 's/##//'

# Suppress docker-compose orphan container warnings
export COMPOSE_IGNORE_ORPHANS=true

t:
	@if [ -z "$(p)" ]; then \
		npm run test:e2e -- --grep-invert "monitoring"; \
	else \
		npm run test:e2e -- $(p); \
	fi

th:
	npm run test:e2e -- --headed --grep-invert "monitoring" ${p}

tui:
	npm run test:e2e -- --ui --grep-invert "monitoring" ${p}

thui:
	npm run test:e2e -- --headed --ui --grep-invert "monitoring" ${p}

lint:
	npm run lint

type:
	npm run type-check

dev:
	if [ -n "$(p)" ]; then npm run dev -- --port $(p); else npm run dev; fi

cld: ##
	./run_claude_queue.sh ${p} \
	  --dangerously-skip-permissions \
	  --add-dir ./ \
	  --stream \
	  --verbose

diff: ##
	git diff main...HEAD > diff.txt

deploy: ## Deploy to server via Ansible
	npm run build && ansible-playbook -i ansible/inventory.ini ansible/deploy.yml

deploy-local: ## Deploy locally on port 3035
	npm run build && ansible-playbook ansible/deploy-local.yml

