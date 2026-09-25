const taller = {
  nombre: 'Introducción a Python',
  instructor: 'Ing. María López',
  cupo: 25,
  inscritos: 25,
};

// TODO: Object.keys — imprime solo los nombres de las propiedades de `taller`
console.log("Propiedades de taller:");
console.log(Object.keys(taller));

// TODO: Object.values — imprime solo los valores
console.log("\nValores de taller:");
console.log(Object.values(taller));

// TODO: Object.entries — recorre con for..of e imprime "campo: valor" de cada propiedad
console.log("\nPropiedades y valores con Object.entries:");
for (const [campo, valor] of Object.entries(taller)) {
  console.log(`${campo}: ${valor}`);
}

// TODO: JSON.stringify — convierte `taller` a texto (guárdalo en `textoJson`) e imprímelo
const textoJson = JSON.stringify(taller, null, 2);
console.log("Objeto convertido a cadena JSON:");
console.log(textoJson);
console.log('tipo: ', typeof textoJson);

// TODO: JSON.parse — convierte `textoJson` de vuelta a objeto (guárdalo en `objetoDeVuelta`)
//       e imprime `objetoDeVuelta.nombre`
console.log("Nombre extraído de objetoDeVuelta:");
const objetoDeVuelta = JSON.parse(textoJson);
console.log('tipo: ', typeof objetoDeVuelta);
console.log(objetoDeVuelta.nombre);

