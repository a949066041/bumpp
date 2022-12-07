import { bold, green } from 'kleur'
import prompts from 'prompts'
import { SemVer, valid as isValidVersion } from 'semver'
import dayjs from 'dayjs'
import type { BumpRelease } from './normalize-options'
import type { Operation } from './operation'
import type { ReleaseType } from './release-type'
import { isPrerelease } from './release-type'

/**
 * Determines the new version number, possibly by prompting the user for it.
 */
export async function getNewVersion(operation: Operation): Promise<Operation> {
  const { release } = operation.options
  const { oldVersion } = operation.state

  switch (release.type) {
    case 'prompt':
      return promptForNewVersion(operation)

    case 'version':
      return operation.update({
        newVersion: new SemVer(release.version, true).version,
      })

    default:
      return operation.update({
        release: release.type,
        newVersion: getNextVersion(oldVersion, release),
      })
  }
}

/**
 * Returns the next version number of the specified type.
 */
function getNextVersion(oldVersion: string, bump: BumpRelease): string {
  const oldSemVer = new SemVer(oldVersion)
  const newSemVer = oldSemVer.inc(bump.type as any, bump.preid)

  if (
    isPrerelease(bump.type)
    && newSemVer.prerelease.length === 2
    && newSemVer.prerelease[0] === bump.preid
    && String(newSemVer.prerelease[1]) === '0'
  ) {
    // This is a special case when going from a non-prerelease version to a prerelease version.
    // SemVer sets the prerelease version to zero (e.g. "1.23.456" => "1.23.456-beta.0").
    // But the user probably expected it to be "1.23.456-beta.1" instead.
    // @ts-expect-error - TypeScript thinks this array is read-only
    newSemVer.prerelease[1] = '1'
    newSemVer.format()
  }

  return newSemVer.version
}

const MX_RULES = {
  年份: 0,
  主版本: 1,
  子版本号: 2,
  修订版本号: 3,
}

type RULES = keyof typeof MX_RULES

/**
 * Returns the next version number for all release types.
 */
function getNextVersions(oldVersion: string) {
  const next: Partial<Record<RULES, string>> = {}

  for (const type of ['年份', '主版本', '子版本号', '修订版本号'] as RULES[]) {
    const oldList = oldVersion.split('.') as unknown as (number | string)[]
    const currentPoint = MX_RULES[type as RULES]
    oldList.splice(currentPoint, 1, Number(oldList[currentPoint]) + 1)
    oldList.push(dayjs().format('MMDD') as string)
    next[type] = oldList.join('.')
  }

  return next
}

/**
 * Prompts the user for the new version number.
 *
 * @returns - A tuple containing the new version number and the release type (if any)
 */
async function promptForNewVersion(operation: Operation): Promise<Operation> {
  const { oldVersion } = operation.state

  const next = getNextVersions(oldVersion)

  const PADDING = 13
  const answers = await prompts([
    {
      type: 'autocomplete',
      name: 'release',
      message: `Current version ${green(oldVersion)}`,
      initial: 'next',
      choices: [
        { value: '年份', title: `${'年份'.padStart(PADDING, ' ')} ${bold(next['年份'] || '')}` },
        { value: '主版本', title: `${'主版本'.padStart(PADDING, ' ')} ${bold(next['主版本'] || '')}` },
        { value: '子版本号', title: `${'子版本号'.padStart(PADDING, ' ')} ${bold(next['子版本号'] || '')}` },
        { value: '修订版本号', title: `${'修订版本号'.padStart(PADDING, ' ')} ${bold(next['修订版本号'] || '')}` },
      ],
    },
    {
      type: prev => prev === 'custom' ? 'text' : null,
      name: 'custom',
      message: 'Enter the new version number:',
      initial: oldVersion,
      validate: (custom: string) => {
        return isValidVersion(custom) ? true : 'That\'s not a valid version number'
      },
    },
  ]) as {
    release: ReleaseType | 'next' | 'none' | 'custom'
    custom?: string
  }

  return operation.update({ newVersion: next[answers.release as RULES] })
}
