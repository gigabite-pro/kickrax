import { useRef, Suspense, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";

interface ShoeProps {
    mousePosition: { x: number; y: number };
}

function Shoe({ mousePosition }: ShoeProps) {
    const { scene } = useGLTF("/models/scene.gltf");
    const meshRef = useRef<THREE.Group>(null);
    const { viewport } = useThree();

    // Enable shadows on all meshes in the model
    useEffect(() => {
        scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
    }, [scene]);

    // Target rotation based on mouse position (inverted for opposite direction)
    const targetRotation = useRef({ x: 0, y: -5 });

    useFrame(() => {
        if (meshRef.current) {
            // Calculate target rotation (opposite to mouse movement)
            // Reduced x-rotation to prevent clipping through shadow
            targetRotation.current.x = -mousePosition.y * 0.15;
            targetRotation.current.y = -mousePosition.x * 0.5;

            // Smooth interpolation
            meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, targetRotation.current.x + 0.1, 0.05);
            meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, targetRotation.current.y - 1.0, 0.05);
        }
    });

    return (
        <group ref={meshRef} scale={viewport.width > 6 ? 10 : 7} position={[-0.3, -0.65, 0]} rotation={[0.15, -3, 0]}>
            <primitive object={scene} />
        </group>
    );
}

interface ShoeModelProps {
    mousePosition: { x: number; y: number };
}

export default function ShoeModel({ mousePosition }: ShoeModelProps) {
    return (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center">
            <Canvas shadows camera={{ position: [0, 0, 5], fov: 35 }} style={{ background: "transparent" }}>
                <ambientLight intensity={0.7} />
                {/* Main light from front-top to cast shadow behind */}
                <directionalLight
                    position={[0, 5, 10]}
                    intensity={1.5}
                    castShadow
                    shadow-mapSize={[2048, 2048]}
                    shadow-camera-far={50}
                    shadow-camera-left={-10}
                    shadow-camera-right={10}
                    shadow-camera-top={10}
                    shadow-camera-bottom={-10}
                />
                {/* Fill light from side */}
                <directionalLight position={[5, 3, 5]} intensity={0.6} />
                <directionalLight position={[-5, 3, 5]} intensity={0.4} />

                {/* Spotlight from front */}
                <spotLight position={[0, 5, 8]} intensity={0.8} angle={0.5} penumbra={1} castShadow />

                <Suspense fallback={null}>
                    <Shoe mousePosition={mousePosition} />
                    <ContactShadows position={[0, -0.9, 0]} opacity={0.4} scale={8} blur={2} far={2} color="#1b1717" />
                    <Environment preset="city" />
                </Suspense>
            </Canvas>
        </div>
    );
}

// Preload the model
useGLTF.preload("/models/scene.gltf");
