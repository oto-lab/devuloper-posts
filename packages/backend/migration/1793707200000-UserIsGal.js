/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class UserIsGal1793707200000 {
    name = 'UserIsGal1793707200000';

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" ADD "isGal" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "user"."isGal" IS 'Whether the User speaks in gal-moji.'`);
    }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "isGal"`);
    }
}
