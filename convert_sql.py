import re
import os

def main():
    os.makedirs('infra/postgres', exist_ok=True)
    with open('infra/mysql/init_02_24_2026.sql', 'r', encoding='utf-8') as f:
        sql = f.read()

    # Remove MySQL-specific DB creation and use
    sql = re.sub(r'CREATE DATABASE IF NOT EXISTS mediquery;\n', '', sql)
    sql = re.sub(r'USE mediquery;\n', '', sql)
    
    # Remove backticks
    sql = sql.replace('`', '')
    
    # Remove table engine details
    sql = re.sub(r'\)\s*ENGINE=InnoDB.*?;', ');', sql)

    # Postgres typically uses UUID type, but changing it might affect something else. Let's change VARCHAR(36) to UUID for IDs? Actually VARCHAR(36) is fine for both.

    with open('infra/postgres/init.sql', 'w', encoding='utf-8') as f:
        f.write(sql)

if __name__ == '__main__':
    main()
