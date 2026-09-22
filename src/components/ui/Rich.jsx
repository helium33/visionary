/**
 * A translated sentence with its emphasis marked as **double asterisks**, so
 * each language puts the bold phrase where its own word order does instead of
 * the code splitting the sentence in English order.
 */
export function Rich({ text, strongClassName = 'font-medium text-ink' }) {
  return (
    <>
      {String(text)
        .split('**')
        .map((part, i) =>
          i % 2 ? (
            <strong key={i} className={strongClassName}>
              {part}
            </strong>
          ) : (
            part
          ),
        )}
    </>
  );
}
