/***
  Original code from: https://codepen.io/aaroniker/pen/YoqNRB
  License: MIT
  Modified for use in React among other modifications
*/

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
const { createNoise3D } = require('simplex-noise');

const AIBlob = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const size = Math.min(canvas.clientWidth, canvas.clientHeight);
    const renderer = new THREE.WebGLRenderer({
      canvas,
      context: canvas.getContext('webgl2'),
      antialias: true,
      alpha: true,
    });

    const noise3D = createNoise3D(Math.random);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);

    renderer.setSize(size, size);
    renderer.setPixelRatio(window.devicePixelRatio || 1);

    camera.position.z = 5;

    const geometry = new THREE.SphereGeometry(0.8, 128, 128);

    const vertexShader = `
        varying vec3 vNormal;
        void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;

    const fragmentShader = `
        varying vec3 vNormal;
        uniform vec3 colors[4];  // Now we have 4 colors
        uniform float metallicFactor;

        void main() {
            // Calculate the mixing factors based on the normal vector's components
            float zMix = smoothstep(0.2, 0.8, abs(vNormal.z));
            float yMix = smoothstep(0.2, 0.8, abs(vNormal.y));
            float xMix = smoothstep(0.2, 0.8, abs(vNormal.x));  // Introduce xMix for the 4th color

            // Mix the first two colors using the zMix factor
            vec3 color = mix(colors[0], colors[1], zMix);
            
            // Mix with the third color using the yMix factor
            color = mix(color, colors[2], yMix);
            
            // Mix with the fourth color using the xMix factor
            color = mix(color, colors[3], xMix);

            // Apply metallicFactor to tone down highlights
            color = mix(vec3(1.0), color, metallicFactor); // Mix with white for metallic reduction

            // Set the final color
            gl_FragColor = vec4(color, 1.0);
        }
    `;

    const material = new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        uniforms: {
            colors: { value: [new THREE.Color(0x04E762), new THREE.Color(0xff396b), new THREE.Color(0x3ac2fb), new THREE.Color(0xE4FF1A)] },
            metallicFactor: { value: 1 } // Reduce metallic appearance
        }
    });

    /*
    const lightTop = new THREE.DirectionalLight(0x000000, .7);
    lightTop.position.set(0, 500, 200);
    lightTop.castShadow = true;
    scene.add(lightTop);

    const lightBottom = new THREE.DirectionalLight(0x000000, .25);
    lightBottom.position.set(0, -500, 400);
    lightBottom.castShadow = true;
    scene.add(lightBottom);

    const ambientLight = new THREE.AmbientLight(0x798296);
    scene.add(ambientLight);*/

    const sphere = new THREE.Mesh(geometry, material);

    scene.add(sphere);

    const update = () => {
        let processing = 1;
        //let speed = 51; <- 51 on active??
        let speed = 13;
        let spikesVal = 0.6;
    
        let time = performance.now() * 0.00001 * speed * Math.pow(processing, 3);
        let spikes = spikesVal * processing;
    
        let positionAttribute = sphere.geometry.attributes.position;
        let tempVec = new THREE.Vector3();
    
        for (let i = 0; i < positionAttribute.count; i++) {
            tempVec.fromBufferAttribute(positionAttribute, i);
            tempVec.normalize().multiplyScalar(
                1 + 0.3 * noise3D(tempVec.x * spikes, tempVec.y * spikes, tempVec.z * spikes + time)
            );
            positionAttribute.setXYZ(i, tempVec.x, tempVec.y, tempVec.z);
        }
        positionAttribute.needsUpdate = true;
    
        sphere.geometry.computeVertexNormals();
    };    

    const animate = () => {
      update();

      const time = performance.now() * 0.0005;
      camera.position.x = 5 * Math.cos(time);
      camera.position.z = 5 * Math.sin(time);
      camera.lookAt(scene.position);

      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };

    animate();

    return () => {
      renderer.dispose();
    };
  }, []);

  return (
      <canvas ref={canvasRef} style={{ width: '500px', height: '500px', filter: 'blur(50px)' }}></canvas>
  );
};

export default AIBlob;
