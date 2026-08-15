import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CatForm } from '../../src/components/CatForm'
import { awaitOrQueued, createCat, updateCat, type Cat } from '../../src/lib/db'
import { expectLocalDate, makeCat } from './fixtures'

vi.mock('../../src/lib/db', () => ({
  createCat: vi.fn(),
  updateCat: vi.fn(),
  awaitOrQueued: vi.fn(),
}))

const createCatMock = vi.mocked(createCat)
const updateCatMock = vi.mocked(updateCat)
const awaitOrQueuedMock = vi.mocked(awaitOrQueued)

function renderForm(props: { existing?: Cat; onDone?: () => void } = {}) {
  const onDone = props.onDone ?? vi.fn()
  const result = props.existing
    ? render(<CatForm hid="hh-1" uid="user-1" existing={props.existing} onDone={onDone} />)
    : render(<CatForm hid="hh-1" uid="user-1" onDone={onDone} />)
  return { ...result, onDone }
}

function firstCreateCall() {
  const [call] = createCatMock.mock.calls
  if (call === undefined) throw new Error('createCat was not called')
  return call
}

function firstUpdateCall() {
  const [call] = updateCatMock.mock.calls
  if (call === undefined) throw new Error('updateCat was not called')
  return call
}

function getForm(container: HTMLElement): HTMLFormElement {
  const form = container.querySelector('form')
  if (form === null) throw new Error('form not rendered')
  return form
}

function setBirthDate(value: string): void {
  fireEvent.change(screen.getByTestId('cat-birthdate'), { target: { value } })
}

beforeEach(() => {
  createCatMock.mockReset().mockResolvedValue(undefined)
  updateCatMock.mockReset().mockResolvedValue(undefined)
  awaitOrQueuedMock.mockReset().mockResolvedValue('confirmed')
})

describe('CatForm', () => {
  it('rejects a whitespace-only name', async () => {
    const user = userEvent.setup()
    renderForm()

    // Spaces satisfy the native `required` check, so the click reaches the
    // component's own trim validation.
    await user.type(screen.getByTestId('cat-name'), '   ')
    setBirthDate('2025-04-10')
    await user.click(screen.getByTestId('cat-save'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please give your cat a name (up to 50 characters).',
    )
    expect(createCatMock).not.toHaveBeenCalled()
  })

  it('requires a birth date', async () => {
    const user = userEvent.setup()
    const { container } = renderForm()

    await user.type(screen.getByTestId('cat-name'), 'Mango')
    // fireEvent.submit bypasses jsdom's native `required` blocking so the
    // component's own validation branch is exercised.
    fireEvent.submit(getForm(container))

    expect(await screen.findByRole('alert')).toHaveTextContent('Please pick a birth date.')
    expect(createCatMock).not.toHaveBeenCalled()
  })

  it('creates a cat with nulls for all unset optionals and resets the form', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('cat-name'), 'Mango')
    setBirthDate('2025-04-10')
    await user.click(screen.getByTestId('cat-save'))

    await screen.findByText(/profile saved/i)

    expect(createCatMock).toHaveBeenCalledTimes(1)
    expect(updateCatMock).not.toHaveBeenCalled()
    const [hid, uid, input] = firstCreateCall()
    expect(hid).toBe('hh-1')
    expect(uid).toBe('user-1')
    expect(input.name).toBe('Mango')
    expectLocalDate(input.birthDate, 2025, 3, 10)
    expect(input.breed).toBeNull()
    expect(input.sex).toBe('unknown')
    expect(input.neutered).toBe(false)
    expect(input.neuterDate).toBeNull()
    expect(input.idealWeightKg).toBeNull()
    expect(input.lifeStage).toBeNull() // Auto (from age)
    expect(input.merMultiplierOverride).toBeNull()

    // Create mode clears the form after a successful save.
    expect(screen.getByTestId('cat-name')).toHaveValue('')
    expect(screen.getByTestId('cat-birthdate')).toHaveValue('')
  })

  it('toggles the neuter date field with the neutered checkbox', async () => {
    const user = userEvent.setup()
    renderForm()

    expect(screen.queryByLabelText(/neuter date/i)).not.toBeInTheDocument()

    await user.click(screen.getByTestId('cat-neutered'))
    expect(screen.getByLabelText(/neuter date/i)).toBeInTheDocument()

    await user.click(screen.getByTestId('cat-neutered'))
    expect(screen.queryByLabelText(/neuter date/i)).not.toBeInTheDocument()
  })

  it('submits neuter date and advanced vet values when provided', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('cat-name'), 'Mango')
    setBirthDate('2024-02-29')
    await user.selectOptions(screen.getByTestId('cat-sex'), 'male')
    await user.click(screen.getByTestId('cat-neutered'))
    fireEvent.change(screen.getByLabelText(/neuter date/i), { target: { value: '2025-09-01' } })

    await user.click(screen.getByText('Advanced (vet settings)'))
    await user.type(screen.getByLabelText(/ideal weight/i), '4.5')
    await user.selectOptions(screen.getByLabelText(/life stage/i), 'senior')
    await user.type(screen.getByLabelText(/mer multiplier override/i), '1.5')

    await user.click(screen.getByTestId('cat-save'))
    await screen.findByText(/profile saved/i)

    const [, , input] = firstCreateCall()
    expectLocalDate(input.birthDate, 2024, 1, 29)
    expect(input.sex).toBe('male')
    expect(input.neutered).toBe(true)
    expectLocalDate(input.neuterDate, 2025, 8, 1)
    expect(input.idealWeightKg).toBe(4.5)
    expect(input.lifeStage).toBe('senior')
    expect(input.merMultiplierOverride).toBe(1.5)
  })

  it('keeps the vet fields inside the advanced details section', () => {
    const { container } = renderForm()

    const details = container.querySelector('details')
    if (details === null) throw new Error('advanced details section not rendered')
    const advanced = within(details)
    expect(advanced.getByText('Advanced (vet settings)')).toBeInTheDocument()
    expect(advanced.getByLabelText(/ideal weight/i)).toBeInTheDocument()
    expect(advanced.getByLabelText(/life stage/i)).toBeInTheDocument()
    expect(advanced.getByLabelText(/mer multiplier override/i)).toBeInTheDocument()
  })

  it('prefills from the existing cat and patches it in edit mode', async () => {
    const user = userEvent.setup()
    const existing = makeCat()
    const { onDone } = renderForm({ existing })

    expect(screen.getByTestId('cat-name')).toHaveValue('Pixel')
    expect(screen.getByTestId('cat-birthdate')).toHaveValue('2023-05-02')
    expect(screen.getByLabelText('Breed (optional)')).toHaveValue('Ragdoll')
    expect(screen.getByTestId('cat-sex')).toHaveValue('female')
    expect(screen.getByTestId('cat-neutered')).toBeChecked()
    expect(screen.getByLabelText(/neuter date/i)).toHaveValue('2024-01-15')
    // Decimal fields are type="text" so the iOS keypad's comma survives.
    expect(screen.getByLabelText(/ideal weight/i)).toHaveValue('4.5')
    expect(screen.getByLabelText(/life stage/i)).toHaveValue('adult_neutered')
    expect(screen.getByLabelText(/mer multiplier override/i)).toHaveValue('1.1')

    const nameInput = screen.getByTestId('cat-name')
    await user.clear(nameInput)
    await user.type(nameInput, 'Pixel II')
    await user.click(screen.getByTestId('cat-save'))

    await screen.findByText(/profile saved/i)

    expect(createCatMock).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledTimes(1)
    const [hid, catId, patch] = firstUpdateCall()
    expect(hid).toBe('hh-1')
    expect(catId).toBe('cat-9')
    expect(patch.name).toBe('Pixel II')
    expect(patch.breed).toBe('Ragdoll')
    expect(patch.sex).toBe('female')
    expect(patch.neutered).toBe(true)
    expect(patch.idealWeightKg).toBe(4.5)
    expect(patch.lifeStage).toBe('adult_neutered')
    expect(patch.merMultiplierOverride).toBe(1.1)
    expectLocalDate(patch.birthDate, 2023, 4, 2)
    expectLocalDate(patch.neuterDate, 2024, 0, 15)

    // Edit mode keeps the edited values on screen.
    expect(screen.getByTestId('cat-name')).toHaveValue('Pixel II')
  })

  it('shows the offline flash when the write is queued', async () => {
    awaitOrQueuedMock.mockResolvedValueOnce('queued')
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('cat-name'), 'Mango')
    setBirthDate('2025-04-10')
    await user.click(screen.getByTestId('cat-save'))

    expect(await screen.findByText(/will sync when back online/i)).toBeInTheDocument()
  })

  it('shows an alert and keeps the values when the save rejects', async () => {
    awaitOrQueuedMock.mockRejectedValueOnce(new Error('Firestore said no'))
    const user = userEvent.setup()
    const { onDone } = renderForm()

    await user.type(screen.getByTestId('cat-name'), 'Mango')
    setBirthDate('2025-04-10')
    await user.click(screen.getByTestId('cat-save'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Firestore said no')
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByTestId('cat-name')).toHaveValue('Mango')
    expect(screen.getByTestId('cat-save')).toBeEnabled()
  })
})
